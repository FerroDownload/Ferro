import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type SessionDetail = {
  label: string;
  value: string;
};

type SessionDetailsProps = {
  title?: string;
  ariaLabel?: string;
  details: SessionDetail[];
};

export const SessionDetails = ({
  title = "Session",
  ariaLabel = "Session details",
  details,
}: SessionDetailsProps) => (
  <Card
    role="complementary"
    aria-label={ariaLabel}
    className="hidden min-h-0 rounded-md shadow-sm xl:block"
  >
    <CardHeader className="p-3 pb-2">
      <CardTitle className="text-sm">{title}</CardTitle>
    </CardHeader>
    <Separator />
    <CardContent className="p-3">
      <dl className="flex flex-col gap-3">
        {details.map((detail) => (
          <div key={detail.label} className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              {detail.label}
            </dt>
            <dd className="mt-1 truncate text-sm text-foreground">
              {detail.value}
            </dd>
          </div>
        ))}
      </dl>
    </CardContent>
  </Card>
);
