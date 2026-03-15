function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInline(text) {
  let formatted = escapeHtml(text);
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  formatted = formatted.replace(/\*(.+?)\*/g, "<em>$1</em>");
  formatted = formatted.replace(/`(.+?)`/g, "<code>$1</code>");
  return formatted;
}

function parseBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let list = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (list) {
        blocks.push({ type: "list", items: list });
        list = null;
      }
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("• ")) {
      if (!list) list = [];
      list.push(line.replace(/^[-•]\s*/, ""));
      continue;
    }

    if (list) {
      blocks.push({ type: "list", items: list });
      list = null;
    }

    if (/^\*\*(.+)\*\*$/.test(line)) {
      blocks.push({ type: "heading", content: line.replace(/^\*\*(.+)\*\*$/, "$1") });
    } else if (/^#+\s+/.test(line)) {
      blocks.push({ type: "heading", content: line.replace(/^#+\s+/, "") });
    } else {
      blocks.push({ type: "text", content: line });
    }
  }

  if (list) {
    blocks.push({ type: "list", items: list });
  }

  return blocks;
}

const isFreakSummaryHeading = (content) => {
  if (!content) return false;
  return content.replace(/\s+/g, " ").trim().toUpperCase() === "FREAKSUMMARY";
};

export default function FreakStatsInsights({ text, iconSrc, iconStyle }) {
  if (!text) return null;
  const blocks = parseBlocks(text);

  return (
    <div className="freakstats-insights">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const isFreakSummary = isFreakSummaryHeading(block.content);
          if (isFreakSummary) {
            return (
              <div className="insight-heading-group" key={`heading-${index}`}>
                <h3
                  className="insight-heading"
                  dangerouslySetInnerHTML={{ __html: formatInline(block.content) }}
                />
                <div className="insight-subheading">
                  <span className="insight-subheading__text">
                    Powered BY FREAKSTATS{iconSrc ? (
                      <img
                        src={iconSrc}
                        alt=""
                        aria-hidden="true"
                        className="freakstats-modal-title__icon insight-subheading__icon"
                        style={iconStyle}
                      />
                    ) : null}
                  </span>
                </div>
              </div>
            );
          }
          return (
            <h3
              key={`heading-${index}`}
              className="insight-heading"
              dangerouslySetInnerHTML={{ __html: formatInline(block.content) }}
            />
          );
        }

        if (block.type === "list") {
          return (
            <ul key={`list-${index}`} className="insight-list">
              {block.items.map((item, itemIndex) => (
                <li
                  key={`list-${index}-item-${itemIndex}`}
                  dangerouslySetInnerHTML={{ __html: formatInline(item) }}
                />
              ))}
            </ul>
          );
        }

        return (
          <p
            key={`text-${index}`}
            className="insight-text"
            dangerouslySetInnerHTML={{ __html: formatInline(block.content) }}
          />
        );
      })}
    </div>
  );
}
