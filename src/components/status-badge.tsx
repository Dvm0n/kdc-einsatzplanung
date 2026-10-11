import { Check, Clock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL } from "@/lib/labels";

export function StatusBadge({ status }: { status: string }) {
  if (status === "APPROVED")
    return (
      <Badge className="bg-success/15 text-success">
        <Check /> {STATUS_LABEL[status]}
      </Badge>
    );
  if (status === "REJECTED")
    return (
      <Badge variant="destructive">
        <X /> {STATUS_LABEL[status]}
      </Badge>
    );
  if (status === "CANCELLED") return <Badge variant="outline">{STATUS_LABEL[status]}</Badge>;
  return (
    <Badge variant="secondary">
      <Clock /> {STATUS_LABEL[status]}
    </Badge>
  );
}
