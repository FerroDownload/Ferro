import { History } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const EmptyHistoryPanel = () => (
  <Card className="rounded-md border-dashed text-center shadow-sm">
    <CardHeader className="items-center pb-2">
      <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <History aria-hidden="true" className="size-4" />
      </span>
      <p className="text-xs font-medium text-muted-foreground">History</p>
      <CardTitle>
        <h2 className="text-lg">No completed downloads yet</h2>
      </CardTitle>
    </CardHeader>
    <CardContent className="pb-8" />
  </Card>
);
