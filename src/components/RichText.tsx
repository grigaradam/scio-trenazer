"use client";

import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "u", "mark"],
  attributes: {
    ...defaultSchema.attributes,
    code: ["className"],
    span: ["className"],
    div: ["className"],
  },
};

/** ==text== → <mark>, outside of $math$. */
function preprocess(src: string) {
  return src
    .split(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g)
    .map((chunk) => (chunk.startsWith("$") ? chunk : chunk.replace(/==([^=\n][^\n]*?)==/g, "<mark>$1</mark>")))
    .join("");
}

export function RichText({ children, className, inline }: { children: string; className?: string; inline?: boolean }) {
  let markIndex = 0;
  return (
    <div className={clsx("rich", inline && "[&>p]:inline", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], rehypeKatex]}
        components={{
          mark: ({ children }) => <mark style={{ ["--mark-i" as string]: markIndex++ }}>{children}</mark>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="underline">
              {children}
            </a>
          ),
        }}
      >
        {preprocess(children ?? "")}
      </ReactMarkdown>
    </div>
  );
}
