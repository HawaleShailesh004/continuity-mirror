"use client";

import { useCallback, useState } from "react";
import { BottomBar } from "@/components/cm/bottom-bar";
import { RetakeCoach } from "@/components/cm/retake-coach";
import { Screen } from "@/components/cm/screen";
import { ErrorState } from "@/components/cm/states";
import { Button } from "@/components/ui/button";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { capture } from "@/content/copy/capture";
import { retake } from "@/content/copy/retake";
import { toApiError } from "@/lib/client/api";
import type { CheckResult } from "@/lib/client/capture/checks";
import { UnsupportedImageError, decodeFile, encodeForUpload, wholeImage } from "@/lib/client/capture/encode";
import { blocking, checkStill } from "@/lib/client/capture/still";
import { useNavigate, useObjectUrl } from "@/lib/client/hooks";
import { adoptBaseline } from "@/lib/client/journey";
import type { ErrorBody } from "@/lib/contracts";
import { CameraPanel } from "./camera-panel";
import { PhotoReview } from "./photo-review";
import { UploadPanel } from "./upload-panel";

type Source = "camera" | "upload";
type Photo = { blob: Blob; source: Source; results: CheckResult[] | null };

/*
 * Capture: take a photo with live guidance, or choose one. Either way the photo
 * is checked on this device first (one face, facing the camera, close enough,
 * shoulders showing, decent light) and a photo that fails never reaches YouCam,
 * so no units are spent on it. Only "Use this photo" uploads it.
 */
export function CaptureScreen() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Source>("camera");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<{ key: string; heic?: boolean } | null>(null);
  const [serverError, setServerError] = useState<ErrorBody | null>(null);
  const url = useObjectUrl(photo?.blob);

  const settle = useCallback(async (blob: Blob, source: Source, bitmap?: ImageBitmap) => {
    setChecking(true);
    try {
      const image = bitmap ?? (await createImageBitmap(blob));
      const results = await checkStill(image);
      image.close();
      setPhoto({ blob, source, results });
    } finally {
      setChecking(false);
    }
  }, []);

  const onCaptured = useCallback((p: { blob: Blob }) => void settle(p.blob, "camera"), [settle]);

  const onPicked = async (file: File) => {
    setProblem(null);
    setChecking(true);
    try {
      const bitmap = await decodeFile(file);
      const results = await checkStill(bitmap);
      const { blob } = await encodeForUpload(bitmap, wholeImage(bitmap.width, bitmap.height));
      bitmap.close();
      setPhoto({ blob, source: "upload", results });
    } catch (error) {
      setProblem(
        error instanceof UnsupportedImageError ? { key: "image.format", heic: error.hint === "heic" } : { key: "image.format" },
      );
    } finally {
      setChecking(false);
    }
  };

  const again = () => {
    setPhoto(null);
    setServerError(null);
  };

  const use = async () => {
    if (!photo) return;
    setSending(true);
    setServerError(null);
    try {
      await adoptBaseline(photo.blob, photo.source);
      navigate("/start/snapshot");
    } catch (error) {
      setServerError(toApiError(error).body);
      setSending(false);
    }
  };

  const blocked = photo?.results ? blocking(photo.results).length > 0 : false;

  return (
    <Screen
      title={capture.title}
      backHref="/start/consent"
      step={{ n: 2, total: 5 }}
      bottom={
        photo && (
          <BottomBar>
            <Button size="lg" full loading={sending} disabled={blocked || sending} onClick={use}>
              {sending ? capture.review.uploading : capture.review.use}
            </Button>
            <Button variant="secondary" size="lg" full disabled={sending} onClick={again}>
              {photo.source === "camera" ? capture.review.retake : capture.review.chooseOther}
            </Button>
          </BottomBar>
        )
      }
    >
      {photo && url ? (
        <>
          <h2 className="text-lg">{capture.review.title}</h2>
          <PhotoReview url={url} results={photo.results} source={photo.source} onAgain={again} />
          {serverError && (
            <RetakeCoach
              messageKey={serverError.messageKey}
              onChooseOther={() => {
                setTab("upload");
                again();
              }}
            >
              {serverError.retryable && (
                <Button variant="secondary" size="lg" full onClick={use}>
                  {retake.action}
                </Button>
              )}
            </RetakeCoach>
          )}
        </>
      ) : (
        <>
          <p className="text-text-soft">{capture.intro}</p>
          <ChoiceChips
            variant="segment"
            label={capture.tabsLabel}
            value={tab}
            onValueChange={setTab}
            options={[
              { value: "camera", label: capture.tabCamera },
              { value: "upload", label: capture.tabUpload },
            ]}
            className="self-start md:w-72"
          />
          {tab === "camera" ? (
            <CameraPanel onCaptured={onCaptured} onUseUpload={() => setTab("upload")} />
          ) : (
            <>
              <UploadPanel busy={checking} onPicked={(f) => void onPicked(f)} />
              {problem && (
                <ErrorState
                  messageKey={problem.heic ? undefined : problem.key}
                  title={problem.heic ? capture.upload.heic : undefined}
                  headingLevel={3}
                />
              )}
            </>
          )}
          {checking && tab === "camera" && (
            <p role="status" className="text-center text-sm text-text-muted">
              {capture.upload.checking}
            </p>
          )}
        </>
      )}
    </Screen>
  );
}
