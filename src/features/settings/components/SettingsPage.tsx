import type { ReactNode } from "react";
import {
  Download,
  Info,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AdvancedSettings } from "./AdvancedSettings";
import { BitTorrentSettings } from "./BitTorrentSettings";
import { DownloadSettings } from "./DownloadSettings";
import { GeneralSettings } from "./GeneralSettings";

type ToastNotification = {
  tone: "warning";
  message: string;
};

type SettingsPageProps = {
  isCheckingForUpdates: boolean;
  updateMessage: string | null;
  onCheckForUpdates: () => void;
  onToast: (notification: ToastNotification) => void;
};

type SettingsSectionProps = {
  id: string;
  title: string;
  children?: ReactNode;
};

const scrollToSettingsSection = (id: string) => {
  document.getElementById(id)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
};

const settingsSections = [
  { id: "general-settings-title", title: "General", icon: SlidersHorizontal },
  { id: "download-settings-title", title: "Downloads", icon: Download },
  { id: "bittorrent-settings-title", title: "BitTorrent", icon: Settings2 },
  { id: "advanced-settings-title", title: "Advanced", icon: Wrench },
  { id: "about-settings-title", title: "About", icon: Info },
];

const SettingsSection = ({ id, title, children }: SettingsSectionProps) => (
  <section aria-labelledby={id} className="flex flex-col gap-5">
    <div className="grid gap-3 lg:grid-cols-[160px_1fr]">
      <div>
        <h2 id={id} className="text-lg font-semibold text-foreground">
          {title}
        </h2>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
    <Separator />
  </section>
);

export const SettingsPage = ({
  isCheckingForUpdates,
  updateMessage,
  onCheckForUpdates,
  onToast,
}: SettingsPageProps) => (
  <section
    aria-label="Configuration"
    className="flex min-h-0 flex-1 flex-col gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-150"
  >
    <header className="border-b border-border/80 pb-3">
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>
    </header>

    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[10rem_minmax(0,1fr)]">
      <Card className="h-max rounded-md shadow-sm">
        <CardContent className="p-2">
          <nav aria-label="Settings sections">
            <ul className="flex flex-col gap-1">
              {settingsSections.map((section) => {
                const Icon = section.icon;

                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-muted-foreground transition-[background-color,color,transform] hover:translate-x-0.5 hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                      onClick={() => scrollToSettingsSection(section.id)}
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      <span className="truncate">{section.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </CardContent>
      </Card>

      <Card className="min-w-0 rounded-md shadow-sm">
        <CardContent className="flex flex-col gap-5 p-4">
          <SettingsSection id="general-settings-title" title="General">
            <GeneralSettings />
          </SettingsSection>

          <SettingsSection id="download-settings-title" title="Downloads">
            <DownloadSettings />
          </SettingsSection>

          <BitTorrentSettings onToast={onToast} />

          <SettingsSection id="advanced-settings-title" title="Advanced">
            <AdvancedSettings />
          </SettingsSection>

          <SettingsSection id="about-settings-title" title="About">
            <div className="flex flex-col items-start gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onCheckForUpdates}
                disabled={isCheckingForUpdates}
              >
                <RefreshCw
                  aria-hidden="true"
                  data-icon="inline-start"
                  className={
                    isCheckingForUpdates
                      ? "motion-safe:animate-spin"
                      : undefined
                  }
                />
                {isCheckingForUpdates ? "Checking..." : "Check for updates"}
              </Button>
              {updateMessage ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {updateMessage}
                </p>
              ) : null}
            </div>
          </SettingsSection>
        </CardContent>
      </Card>
    </div>
  </section>
);
