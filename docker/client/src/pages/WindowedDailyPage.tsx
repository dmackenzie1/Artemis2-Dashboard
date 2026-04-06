import type { FC } from "react";
import { useEffect, useState } from "react";
import { fetchTimeWindowSummary, type TimeWindowSummaryData } from "../api";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import { LoadingIndicator } from "../components/dashboard/primitives/LoadingIndicator";
import sharedStyles from "../styles/shared.module.css";
import styles from "./WindowedDailyPage.module.css";
import { renderStructuredText } from "../utils/formatting/renderStructuredText";

type WindowedDailyPageProps = {
  componentKey: string;
  pageTitle: string;
  windowHours: 3 | 6 | 12;
};

export const WindowedDailyPage: FC<WindowedDailyPageProps> = ({ componentKey, pageTitle, windowHours }) => {
  const [data, setData] = useState<TimeWindowSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { componentId, componentUid } = useComponentIdentity(componentKey);

  useEffect(() => {
    const load = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const payload = await fetchTimeWindowSummary(windowHours);
        setData(payload);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load this page.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [windowHours]);

  return (
    <div className={sharedStyles.stack} data-component-id={componentId} data-component-uid={componentUid}>
      <article className={sharedStyles.panel}>
        <h2>{pageTitle}</h2>
        <p>
          Rolling summary for the last <strong>{windowHours} hours</strong>, queried from the transcript database and synthesized by the
          LLM.
        </p>
      </article>

      {isLoading ? <LoadingIndicator message="Waiting for results…" variant="pane" /> : null}
      {error ? <article className={sharedStyles.panel}>Unable to load results: {error}</article> : null}

      {!isLoading && !error && data ? (
        <article className={sharedStyles.panel}>
          <h2>Window Overview</h2>
          <p>
            Window: {data.window.start} → {data.window.end}
          </p>
          <p>
            Utterances: {data.stats.utterances} | Words: {data.stats.words} | Channels: {data.stats.channels}
          </p>
          <div className={sharedStyles["formatted-copy"]}>{renderStructuredText(data.summary, sharedStyles["formatted-list"])}</div>
          <h3>{windowHours}-Hour Highlights</h3>
          <div className={styles["hourly-highlight-grid"]}>
            {data.highlights.map((highlight) => (
              <section className={styles["hourly-highlight-card"]} key={`${highlight.hour}-${windowHours}`}>
                <p className={styles["hourly-highlight-hour"]}>{highlight.hour}</p>
                <div className={sharedStyles["formatted-copy"]}>{renderStructuredText(highlight.summary, sharedStyles["formatted-list"])}</div>
              </section>
            ))}
            {data.highlights.length === 0 ? <p>No highlights were returned for this window.</p> : null}
          </div>
        </article>
      ) : null}
    </div>
  );
};
