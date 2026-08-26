import type { Metadata } from "next";
import { DraftFlowApp } from "./DraftFlowApp";

export const metadata: Metadata = {
  title: "稿流 DraftFlow｜公众号内容工作台",
  description: "为公众号团队打造的内容排版、预览与草稿箱同步工作台。",
};

export default function Home() {
  return <DraftFlowApp />;
}
