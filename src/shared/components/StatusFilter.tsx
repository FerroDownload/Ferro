import type { LucideIcon } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type StatusFilterOption<TValue extends string> = {
  label: string;
  value: TValue;
  icon?: LucideIcon;
};

type StatusFilterProps<TValue extends string> = {
  label: string;
  value: TValue;
  options: Array<StatusFilterOption<TValue>>;
  onValueChange: (value: TValue) => void;
};

export const StatusFilter = <TValue extends string>({
  label,
  value,
  options,
  onValueChange,
}: StatusFilterProps<TValue>) => (
  <ToggleGroup
    type="single"
    value={value}
    onValueChange={(nextValue) => {
      if (nextValue) {
        onValueChange(nextValue as TValue);
      }
    }}
    aria-label={label}
    className="justify-start rounded-md border border-border bg-muted/40 p-1"
    size="sm"
  >
    {options.map((option) => {
      const Icon = option.icon;

      return (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.label}
          className="gap-1.5 px-2.5 text-xs"
        >
          {Icon ? (
            <Icon
              aria-hidden="true"
              className="size-3.5 shrink-0"
              strokeWidth={2}
            />
          ) : null}
          {option.label}
        </ToggleGroupItem>
      );
    })}
  </ToggleGroup>
);
