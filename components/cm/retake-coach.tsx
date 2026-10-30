import { CameraIcon, ImageUpIcon, ScanFaceIcon, ShirtIcon, SunIcon, ZoomInIcon, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copy } from "@/content/copy";
import { messageFor } from "@/lib/client/messages";

const icons: Record<string, LucideIcon> = {
  "capture.retake.shoulders": ShirtIcon,
  "capture.retake.faceForward": ScanFaceIcon,
  "capture.retake.faceVisible": SunIcon,
  "capture.retake.size": ZoomInIcon,
  "capture.hairTooShort": ScanFaceIcon,
  "image.format": ImageUpIcon,
  "image.tooSmall": ZoomInIcon,
  "image.tooLarge": ImageUpIcon,
  "generic.tryDifferentPhoto": ScanFaceIcon,
};

/**
 * Turns a rejected-photo messageKey into one clear thing to change and a way
 * to do it. `capture.hairTooShort` is not a retake: the photo is fine, the
 * tool needs longer hair, so it offers no retake button (pass `children`).
 */
export function RetakeCoach({
  messageKey,
  onRetake,
  onChooseOther,
  children,
}: {
  messageKey: string;
  onRetake?: () => void;
  onChooseOther?: () => void;
  children?: React.ReactNode;
}) {
  const words = messageFor(messageKey);
  const Icon = icons[messageKey] ?? CameraIcon;
  const retakeable = messageKey !== "capture.hairTooShort";

  return (
    <section
      aria-labelledby="retake-title"
      role="alert"
      className="flex flex-col items-center gap-5 rounded-card bg-surface p-6 text-center"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-peach" aria-hidden="true">
        <Icon className="size-7" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 id="retake-title" className="text-xl">
          {words.title}
        </h2>
        <p className="text-text-soft">{words.body}</p>
      </div>
      <div className="flex w-full flex-col gap-2.5">
        {retakeable && onRetake && (
          <Button size="lg" full onClick={onRetake}>
            {copy.retake.action}
          </Button>
        )}
        {retakeable && onChooseOther && (
          <Button variant="secondary" size="lg" full onClick={onChooseOther}>
            {copy.retake.chooseOther}
          </Button>
        )}
        {children}
      </div>
    </section>
  );
}
