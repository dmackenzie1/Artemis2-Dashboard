import type { FunctionComponent } from "react";
import packageMetadata from "../../package.json";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import sharedStyles from "../styles/shared.module.css";
import styles from "./AboutPage.module.css";

const TALKYBOT_URL = "https://talkybot.fit.nasa.gov/";

export const AboutPage: FunctionComponent = () => {
  const { componentId, componentUid } = useComponentIdentity("about-page");

  return (
    <section className={sharedStyles["timeline-page"]} data-component-id={componentId} data-component-uid={componentUid}>
      <header className={sharedStyles["timeline-header"]}>
        <p className={sharedStyles["timeline-kicker"]}>About</p>
        <h2>Artemis II Transcript Dashboard</h2>
        <p className={sharedStyles["timeline-subtitle"]}>
          This dashboard presents insights derived from Artemis II mission communication transcripts processed through TalkyBot.
        </p>
      </header>

      <article className={`${sharedStyles.panel} ${styles["about-panel"]}`}>
        <h3>Data Source</h3>
        <p>
          Mission transcript data is derived from
          {" "}
          <a href={TALKYBOT_URL} target="_blank" rel="noreferrer">
            talkybot.fit.nasa.gov
          </a>
          .
        </p>

        <h3>Software Version</h3>
        <p>
          Current dashboard software version:
          {" "}
          <strong>{packageMetadata.version}</strong>
        </p>
      </article>
    </section>
  );
};
