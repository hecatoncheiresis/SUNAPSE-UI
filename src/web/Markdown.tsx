import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

const plugins = [remarkGfm, remarkBreaks];

/** Text shown as formatted Markdown (headings, lists, tables, code). Raw HTML in the text is never rendered, and links open in a new tab. */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`md ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={plugins} components={{ a: ({ node: _node, ...p }) => <a {...p} target="_blank" rel="noreferrer noopener" /> }}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
