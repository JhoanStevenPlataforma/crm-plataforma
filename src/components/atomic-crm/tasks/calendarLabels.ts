/**
 * "Septiembre de 2026", not "Septiembre De 2026": CSS `capitalize` raises
 * every word, including the Spanish and French prepositions.
 */
export const formatMonthLabel = (month: Date, locale: string): string => {
  const label = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(month);
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
};
