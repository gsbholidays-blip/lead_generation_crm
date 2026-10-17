import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityIcon } from "@/components/activity-icon";
import { EmptyState } from "@/components/ui/empty-state";
import { History } from "lucide-react";

type ActivityItem = {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  user: { id: string; name: string } | null;
};

export function LeadTimeline({ activities }: { activities: ActivityItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <EmptyState icon={History} title="No activity yet" size="sm" />
        ) : (
          <ol className="relative space-y-5 border-l pl-5">
            {activities.map((activity) => (
              <li key={activity.id} className="relative">
                <span className="bg-background absolute -left-[27px] flex size-5 items-center justify-center rounded-full border">
                  <ActivityIcon type={activity.type} className="size-3" />
                </span>
                <p className="text-sm">{activity.description}</p>
                <p
                  className="text-muted-foreground text-xs"
                  title={new Date(activity.createdAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                >
                  {activity.user?.name ?? "System"} ·{" "}
                  {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
