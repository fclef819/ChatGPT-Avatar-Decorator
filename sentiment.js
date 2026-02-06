(() => {
  const POSITIVE = [
    "good",
    "great",
    "excellent",
    "amazing",
    "awesome",
    "love",
    "like",
    "happy",
    "thanks",
    "thank you",
    "助かる",
    "素晴らしい",
    "最高",
    "嬉しい",
    "ありがとう",
    "助かった",
    "良い",
    "良かった",
    "わかりやすい"
  ];

  const NEGATIVE = [
    "bad",
    "terrible",
    "awful",
    "hate",
    "sad",
    "sorry",
    "error",
    "issue",
    "problem",
    "困る",
    "最悪",
    "残念",
    "難しい",
    "わからない",
    "だめ",
    "ダメ",
    "無理",
    "失敗"
  ];

  function countMatches(text, list) {
    let count = 0;
    for (const w of list) {
      if (!w) continue;
      if (text.includes(w)) count += 1;
    }
    return count;
  }

  function computeSentimentScore(text) {
    if (!text) return 0;
    const lower = text.toLowerCase();
    const pos = countMatches(lower, POSITIVE);
    const neg = countMatches(lower, NEGATIVE);
    const score = (pos - neg) / (pos + neg + 3);
    return Math.max(-1, Math.min(1, score));
  }

  window.CadSentiment = {
    computeSentimentScore
  };
})();
