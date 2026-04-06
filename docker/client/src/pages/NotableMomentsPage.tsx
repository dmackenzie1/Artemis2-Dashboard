import type { FunctionComponent } from "react";
import { useEffect, useMemo, useState } from "react";
import { fetchNotableMoments, type NotableMoment, type NotableMomentsData } from "../api";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import styles from "../styles.module.css";
import { clientLogger } from "../utils/logging/clientLogger";

type NotableMomentsDay = {
  day: string;
  moments: NotableMoment[];
};

const parseDayPayload = (rawDay: string): NotableMomentsDay | null => {
  try {
    const parsed = JSON.parse(rawDay) as NotableMomentsDay;
    if (!parsed.day || !Array.isArray(parsed.moments)) {
      return null;
    }

    return parsed;
  } catch (_error) {
    return null;
  }
};

export const NotableMomentsPage: FunctionComponent = () => {
  const [data, setData] = useState<NotableMomentsData | null>(null);
  const { componentId, componentUid } = useComponentIdentity("notable-moments-page");

  useEffect(() => {
    void fetchNotableMoments()
      .then((payload) => setData(payload))
      .catch((error: unknown) => {
        clientLogger.error("Failed to load notable moments", { error });
      });
  }, []);

  const days = useMemo(() => {
    return (data?.days ?? []).map(parseDayPayload).filter((entry): entry is NotableMomentsDay => Boolean(entry));
  }, [data]);

  return (
    <div className={styles.stack} data-component-id={componentId} data-component-uid={componentUid}>
      <section className={styles.panel}>
        <h2>Notable Moments</h2>
        <p className={styles.subtle}>
          Top {data?.targetMomentsPerDay ?? 10} utterances per day selected by the notable moments prompt pipeline.
        </p>
      </section>

      {days.length === 0 ? (
        <section className={styles.panel}>
          <p>No notable moments yet. Run ingestion/pipeline and refresh this page.</p>
        </section>
      ) : (
        days.map((dayEntry) => (
          <article className={styles.panel} key={dayEntry.day}>
            <h2>{dayEntry.day}</h2>
            <div className={styles["notable-moment-grid"]}>
              {dayEntry.moments.map((moment) => (
                <section className={styles["notable-moment-card"]} key={`${dayEntry.day}-${moment.rank}-${moment.title}`}>
                  <p className={styles["notable-moment-rank"]}>#{moment.rank}</p>
                  <h3>{moment.title}</h3>
                  <blockquote className={styles["notable-moment-quote"]}>{moment.quote}</blockquote>
                  <p>{moment.reason}</p>
                  <p className={styles["notable-moment-meta"]}>
                    {moment.timestamp ?? "timestamp n/a"} • {moment.channel ?? "channel n/a"}
                  </p>
                </section>
              ))}
            </div>
          </article>
        ))
      )}
    </div>
  );
};
