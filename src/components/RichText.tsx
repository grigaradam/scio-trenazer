"use client";

import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import { preprocess, rehypePlugins, remarkPlugins } from "@/lib/markdown";

export function RichText({ children, className, inline }: { children: string; className?: string; inline?: boolean }) {
  return (
    <div className={clsx("rich", inline && "[&>p]:inline", className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          a:({ children, href }) => (
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
