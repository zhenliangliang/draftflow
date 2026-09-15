"use client";

import { useEffect, useRef } from "react";
import { renderMermaidElements } from "@/lib/mermaid-client";

export function RenderedArticle({ html, className = "markdown-body" }: { html: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    void renderMermaidElements(container);
  }, [html]);

  return <div ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
