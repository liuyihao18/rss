const DISPLAY_TIME_ZONE = "Asia/Shanghai";

export function formatDisplayDate(value: string | Date | null | undefined) {
  const parts = getDateParts(value);
  if (!parts) return "未知日期";
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDisplayDateTime(value: string | Date | null | undefined) {
  const parts = getDateParts(value);
  if (!parts) return "未知发布时间";
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function getDateParts(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === "24" ? "00" : parts.hour,
    minute: parts.minute
  };
}
