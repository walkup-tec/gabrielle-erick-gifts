CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  desired_quantity integer NOT NULL CHECK (desired_quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.gifts TO service_role;
ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER gifts_updated_at BEFORE UPDATE ON public.gifts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  whatsapp text,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.guests TO service_role;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER guests_updated_at BEFORE UPDATE ON public.guests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  guest_name text NOT NULL,
  whatsapp text NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.reservations TO service_role;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER reservations_updated_at BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX reservations_guest_idx ON public.reservations(guest_id);

CREATE TABLE public.reservation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  gift_id uuid NOT NULL REFERENCES public.gifts(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, gift_id)
);
GRANT ALL ON public.reservation_items TO service_role;
ALTER TABLE public.reservation_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX reservation_items_gift_idx ON public.reservation_items(gift_id);

-- Disponibilidade calculada
CREATE OR REPLACE FUNCTION public.gift_reserved(_gift_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(ri.quantity), 0)::int
  FROM public.reservation_items ri
  JOIN public.reservations r ON r.id = ri.reservation_id
  WHERE ri.gift_id = _gift_id AND r.status = 'confirmed'
$$;

-- Confirmação transacional
CREATE OR REPLACE FUNCTION public.confirm_reservation(
  _token text, _guest_name text, _whatsapp text, _items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_guest public.guests%ROWTYPE;
  v_reservation_id uuid;
  v_item jsonb;
  v_gift_id uuid;
  v_qty int;
  v_desired int;
  v_reserved int;
BEGIN
  SELECT * INTO v_guest FROM public.guests WHERE token = _token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_guest');
  END IF;

  IF EXISTS (SELECT 1 FROM public.reservations WHERE guest_id = v_guest.id AND status = 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_reserved');
  END IF;

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty');
  END IF;

  -- trava os presentes envolvidos em ordem estável
  PERFORM 1 FROM public.gifts
   WHERE id IN (SELECT (value->>'gift_id')::uuid FROM jsonb_array_elements(_items))
   ORDER BY id FOR UPDATE;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_gift_id := (v_item->>'gift_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty < 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_quantity');
    END IF;
    SELECT desired_quantity INTO v_desired FROM public.gifts WHERE id = v_gift_id;
    IF v_desired IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_missing');
    END IF;
    v_reserved := public.gift_reserved(v_gift_id);
    IF v_reserved + v_qty > v_desired THEN
      RETURN jsonb_build_object('ok', false, 'error', 'unavailable', 'gift_id', v_gift_id);
    END IF;
  END LOOP;

  INSERT INTO public.reservations (guest_id, guest_name, whatsapp)
  VALUES (v_guest.id, _guest_name, _whatsapp)
  RETURNING id INTO v_reservation_id;

  INSERT INTO public.reservation_items (reservation_id, gift_id, quantity)
  SELECT v_reservation_id, (value->>'gift_id')::uuid, (value->>'quantity')::int
  FROM jsonb_array_elements(_items);

  UPDATE public.guests SET whatsapp = _whatsapp, name = COALESCE(NULLIF(name, ''), _guest_name) WHERE id = v_guest.id;

  RETURN jsonb_build_object('ok', true, 'reservation_id', v_reservation_id);
END; $$;

-- Ajuste administrativo de item (respeita disponibilidade)
CREATE OR REPLACE FUNCTION public.admin_set_reservation_item(
  _reservation_id uuid, _gift_id uuid, _quantity int
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_desired int; v_reserved int; v_current int;
BEGIN
  PERFORM 1 FROM public.gifts WHERE id = _gift_id FOR UPDATE;
  SELECT desired_quantity INTO v_desired FROM public.gifts WHERE id = _gift_id;
  IF v_desired IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'gift_missing'); END IF;

  SELECT COALESCE(quantity,0) INTO v_current FROM public.reservation_items
   WHERE reservation_id = _reservation_id AND gift_id = _gift_id;
  v_current := COALESCE(v_current, 0);

  IF _quantity <= 0 THEN
    DELETE FROM public.reservation_items WHERE reservation_id = _reservation_id AND gift_id = _gift_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  v_reserved := public.gift_reserved(_gift_id);
  IF (v_reserved - v_current + _quantity) > v_desired THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unavailable');
  END IF;

  INSERT INTO public.reservation_items (reservation_id, gift_id, quantity)
  VALUES (_reservation_id, _gift_id, _quantity)
  ON CONFLICT (reservation_id, gift_id) DO UPDATE SET quantity = EXCLUDED.quantity;

  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE ALL ON FUNCTION public.confirm_reservation(text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_reservation_item(uuid,uuid,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_reservation(text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_reservation_item(uuid,uuid,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;