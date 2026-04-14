export const STOIC_QUOTES = [
  {
    quote: "You have power over your mind — not outside events. Realize this, and you will find strength.",
    author: "Marcus Aurelius",
    period: "121 – 180 AD",
  },
  {
    quote: "The impediment to action advances action. What stands in the way becomes the way.",
    author: "Marcus Aurelius",
    period: "121 – 180 AD",
  },
  {
    quote: "Waste no more time arguing about what a good man should be. Be one.",
    author: "Marcus Aurelius",
    period: "121 – 180 AD",
  },
  {
    quote: "If it is not right, do not do it; if it is not true, do not say it.",
    author: "Marcus Aurelius",
    period: "121 – 180 AD",
  },
  {
    quote: "The best revenge is to be unlike him who performed the injury.",
    author: "Marcus Aurelius",
    period: "121 – 180 AD",
  },
  {
    quote: "Do not indulge in dreams of having what you have not, but reckon up the chief of the blessings you do possess.",
    author: "Marcus Aurelius",
    period: "121 – 180 AD",
  },
  {
    quote: "Never let the future disturb you. You will meet it, if you have to, with the same weapons of reason which today arm you against the present.",
    author: "Marcus Aurelius",
    period: "121 – 180 AD",
  },
  {
    quote: "He is a wise man who does not grieve for the things which he has not, but rejoices for those which he has.",
    author: "Epictetus",
    period: "c. 50 – 135 AD",
  },
  {
    quote: "Make the best use of what is in your power, and take the rest as it happens.",
    author: "Epictetus",
    period: "c. 50 – 135 AD",
  },
  {
    quote: "It is not what happens to you, but how you react to it that matters.",
    author: "Epictetus",
    period: "c. 50 – 135 AD",
  },
  {
    quote: "First say to yourself what you would be; then do what you have to do.",
    author: "Epictetus",
    period: "c. 50 – 135 AD",
  },
  {
    quote: "Men are disturbed not by the things which happen, but by the opinions about the things.",
    author: "Epictetus",
    period: "c. 50 – 135 AD",
  },
  {
    quote: "Seek not the good in external things; seek it in yourselves.",
    author: "Epictetus",
    period: "c. 50 – 135 AD",
  },
  {
    quote: "We suffer more in imagination than in reality.",
    author: "Seneca",
    period: "c. 4 BC – 65 AD",
  },
  {
    quote: "Luck is what happens when preparation meets opportunity.",
    author: "Seneca",
    period: "c. 4 BC – 65 AD",
  },
  {
    quote: "Begin at once to live, and count each separate day as a separate life.",
    author: "Seneca",
    period: "c. 4 BC – 65 AD",
  },
  {
    quote: "It is not that I am brave, but that I know what is not worth fearing.",
    author: "Seneca",
    period: "c. 4 BC – 65 AD",
  },
  {
    quote: "Associate with people who are likely to improve you.",
    author: "Seneca",
    period: "c. 4 BC – 65 AD",
  },
  {
    quote: "No man was ever wise by chance.",
    author: "Seneca",
    period: "c. 4 BC – 65 AD",
  },
  {
    quote: "Omnia aliena sunt, tempus tantum nostrum est. (All things are alien to us; time alone is ours.)",
    author: "Seneca",
    period: "c. 4 BC – 65 AD",
  },
  {
    quote: "He who fears death will never do anything worthy of a man who is alive.",
    author: "Seneca",
    period: "c. 4 BC – 65 AD",
  },
  {
    quote: "Freedom is the only worthy goal in life. It is won by disregarding things that lie beyond our control.",
    author: "Epictetus",
    period: "c. 50 – 135 AD",
  },
  {
    quote: "The whole future lies in uncertainty: live immediately.",
    author: "Seneca",
    period: "c. 4 BC – 65 AD",
  },
  {
    quote: "Confine yourself to the present.",
    author: "Marcus Aurelius",
    period: "121 – 180 AD",
  },
  {
    quote: "Do not pray for an easy life. Pray for the strength to endure a difficult one.",
    author: "Marcus Aurelius",
    period: "121 – 180 AD",
  },
  {
    quote: "How long are you going to wait before you demand the best for yourself?",
    author: "Epictetus",
    period: "c. 50 – 135 AD",
  },
  {
    quote: "Wealth consists not in having great possessions, but in having few wants.",
    author: "Epictetus",
    period: "c. 50 – 135 AD",
  },
  {
    quote: "It is not the man who has too little, but the man who craves more, that is poor.",
    author: "Seneca",
    period: "c. 4 BC – 65 AD",
  },
  {
    quote: "He suffers more than necessary, who suffers before it is necessary.",
    author: "Seneca",
    period: "c. 4 BC – 65 AD",
  },
  {
    quote: "Difficulties strengthen the mind, as labor does the body.",
    author: "Seneca",
    period: "c. 4 BC – 65 AD",
  },
];

/** Return a quote that differs from the last one shown (best-effort). */
export function getRandomQuote(lastIndex = -1) {
  let idx;
  do {
    idx = Math.floor(Math.random() * STOIC_QUOTES.length);
  } while (idx === lastIndex && STOIC_QUOTES.length > 1);
  return { ...STOIC_QUOTES[idx], index: idx };
}
