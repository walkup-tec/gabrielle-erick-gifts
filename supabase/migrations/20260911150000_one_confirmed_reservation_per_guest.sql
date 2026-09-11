-- One confirmed reservation per guest (spec: guest cannot confirm twice)
CREATE UNIQUE INDEX IF NOT EXISTS reservations_one_confirmed_per_guest
ON public.reservations (guest_id)
WHERE status = 'confirmed';
