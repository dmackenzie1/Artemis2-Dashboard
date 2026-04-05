import type { FC } from "react";

const imagery = [
  {
    title: "Blue Marble limb view",
    description: "Apollo-era Earth imagery used as mission dashboard backdrop.",
    url: "https://images-assets.nasa.gov/image/AS17-148-22727/AS17-148-22727~orig.jpg"
  },
  {
    title: "Earth full-disk view",
    description: "Full-disk Earth texture layer for Artemis mission atmosphere.",
    url: "https://images-assets.nasa.gov/image/PIA18033/PIA18033~orig.jpg"
  }
];

export const MissionImageryPanel: FC = () => {
  return (
    <section className="panel space-panel span2">
      <h2>Artemis 2 Mission Imagery</h2>
      <div className="imagery-grid">
        {imagery.map((entry) => (
          <article key={entry.title} className="imagery-card">
            <img src={entry.url} alt={entry.title} loading="lazy" />
            <div>
              <h3>{entry.title}</h3>
              <p className="subtle">{entry.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
