import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nova CRM — отдел продаж Nova Clinic" },
      {
        name: "description",
        content:
          "Рабочее место отдела продаж Nova Clinic: воронка, заявки, прайс и расчёт по филиалам.",
      },
      { property: "og:title", content: "Nova CRM — отдел продаж Nova Clinic" },
      {
        property: "og:description",
        content: "Воронка, заявки, прайс и расчёт по филиалам Nova Clinic.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/funnel" });
  },
});
