import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nova CRM — отдел продаж Nova Clinic" },
      {
        name: "description",
        content:
          "Простая CRM Nova Clinic: база пациентов, хирургия, чекап и автоматические отчёты.",
      },
      { property: "og:title", content: "Nova CRM — отдел продаж Nova Clinic" },
      {
        property: "og:description",
        content: "База пациентов, хирургия, чекап и автоматические отчёты Nova Clinic.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
