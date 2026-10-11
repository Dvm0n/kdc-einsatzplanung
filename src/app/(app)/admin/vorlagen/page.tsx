import { db } from "@/lib/db";
import { ActivitiesCard } from "./activities-card";
import { TemplatesCard } from "./templates-card";

export default async function TemplatesPage() {
  const [templates, activities] = await Promise.all([
    db.shiftTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { startMin: "asc" }] }),
    db.activityType.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const acts = activities.map(({ id, key, name, color, isPhoneTime, isWorkTime, isBreak }) => ({
    id,
    key,
    name,
    color,
    isPhoneTime,
    isWorkTime,
    isBreak,
  }));
  return (
    <div className="space-y-6">
      <TemplatesCard
        templates={templates.map(({ id, name, startMin, endMin, activityTypeId }) => ({
          id,
          name,
          startMin,
          endMin,
          activityTypeId,
        }))}
        activities={acts}
      />
      <ActivitiesCard activities={acts} />
    </div>
  );
}
