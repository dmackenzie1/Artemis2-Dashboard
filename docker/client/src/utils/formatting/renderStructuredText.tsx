import type { ReactNode } from "react";

export const renderStructuredText = (text: string, className?: string): ReactNode => {
  const lines = text
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = (): void => {
    if (listBuffer.length === 0) {
      return;
    }

    blocks.push(
      <ul className={className} key={`list-${blocks.length}`}>
        {listBuffer.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(?:#{1,6}\s+)?([A-Za-z0-9][A-Za-z0-9\s/&-]{2,}):$/u);
    if (headingMatch) {
      flushList();
      blocks.push(<h3 key={`heading-${blocks.length}`}>{headingMatch[1]}</h3>);
      continue;
    }

    const bulletMatch = line.match(/^[-*•]\s+(.+)/u);
    if (bulletMatch?.[1]) {
      listBuffer.push(bulletMatch[1]);
      continue;
    }

    flushList();
    blocks.push(<p key={`paragraph-${blocks.length}`}>{line}</p>);
  }

  flushList();

  return <>{blocks}</>;
};
