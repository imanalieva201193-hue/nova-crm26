import { createFileRoute } from "@tanstack/react-router";
import { SurgeryReport } from "@/components/crm/SurgeryReport";

export const Route = createFileRoute("/_authenticated/surgery")({
  head: () => ({
    meta: [
      { title: "Хирургия — Nova CRM" },
      {
        name: "description",
        content:
          "Отчёт менеджеров по хирургии: консультации, записи на операцию, операции и конверсия по каждому хирургу.",
      },
      { property: "og:title", content: "Хирургия — Nova CRM" },
      {
        property: "og:description",
        content:
          "Отчёт менеджеров по хирургии: консультации, записи на операцию, операции и конверсия по каждому хирургу.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SurgeryPage,
});

function SurgeryPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          Менеджеры по хирургии
        </div>
        <h1 className="font-display text-4xl font-bold">Хирургия</h1>
      </div>
      <SurgeryReport />
    </div>
  );
}
