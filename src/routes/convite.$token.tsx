import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/convite/$token")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/",
      search: { token: params.token },
    });
  },
});
