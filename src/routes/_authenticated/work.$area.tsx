import { createFileRoute, notFound } from "@tanstack/react-router";
import { Workspace } from "@/components/crm/Workspace";
import { isWorkspaceKey, WORKSPACES } from "@/lib/crm";
export const Route = createFileRoute("/_authenticated/work/$area")({
  loader: ({ params }) => {
    if (!isWorkspaceKey(params.area)) throw notFound();
    return { area: params.area };
  },
  head: ({ loaderData }) => {
    const title = loaderData
      ? `${WORKSPACES[loaderData.area].title} — NOVA CRM`
      : "Направление недоступно — NOVA CRM";
    const description = "Единая база пациентов и отчёт рабочего направления NOVA CRM.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: WorkPage,
});
function WorkPage() {
  const { area } = Route.useLoaderData();
  return <Workspace key={area} area={area} />;
}
