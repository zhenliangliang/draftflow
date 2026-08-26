import type { Metadata } from "next";
import { DraftFlowApp } from "./DraftFlowApp";

export const metadata: Metadata = {
  title: "稿流 DraftFlow｜公众号内容工作台",
  description: "为公众号团队打造的内容排版、预览与草稿箱同步工作台。",
};

export default function Home() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const today = `${value("month")}${value("day")} ${value("weekday")}`;
  return <DraftFlowApp today={today} />;
}
