window.W = window.W || {};

W.learn = (() => {
  const LESSONS = [
    {
      id: "wallets",
      icon: "🔐",
      title: "Wallet Security 101",
      body: "Hot wallets (MetaMask, Phantom) live in your browser — convenient but online. Cold wallets (Ledger, Trezor) keep keys offline. Golden rules: never share your seed phrase, use hardware wallets for long-term holdings, and revoke approvals you no longer use.",
      quiz: {
        q: "Where should your seed phrase live?",
        a: [
          "Cloud password manager",
          "Paper / offline",
          "Notes app",
          "Email draft",
        ],
        correct: 1,
      },
    },
    {
      id: "defi",
      icon: "🏦",
      title: "DeFi Basics",
      body: "Decentralized Finance replaces intermediaries with smart contracts: swap, lend, borrow and earn yield on-chain. Key risks: smart-contract bugs, impermanent loss in LP positions, and depegs. Check TVL, audits and protocol age before depositing.",
      quiz: {
        q: "A common risk of providing liquidity is…",
        a: ["Impermanent loss", "Gas refunds", "Guaranteed yield", "KYC"],
        correct: 0,
      },
    },
    {
      id: "airdrops",
      icon: "🪂",
      title: "Airdrop Hunting",
      body: "Projects reward early users with token airdrops. Track active testnets, complete tasks consistently and use protocols genuinely. Never click “claim” links from DMs — only use official sources.",
      quiz: {
        q: "Airdrop claim links sent via DMs are usually…",
        a: ["Safe", "Scams", "Required", "Verified"],
        correct: 1,
      },
    },
    {
      id: "cycles",
      icon: "🔄",
      title: "Market Cycles & Risk",
      body: "Crypto moves in cycles driven by liquidity, halvings and sentiment (Fear & Greed). Size positions so a 50% drawdown cannot wipe you out, take profit into euphoria, and accumulate during fear.",
      quiz: {
        q: "Fear & Greed at 90 signals…",
        a: ["Extreme fear", "Extreme greed", "A halving", "Stable markets"],
        correct: 1,
      },
    },
  ];
  const KEY = "learn";
  const prog = () => W.store.get(KEY, { done: [] });

  function render(view) {
    const p = prog();
    view.innerHTML = `
      <div class="card"><h3>📚 Learn Crypto</h3>
        <div class="meter"><div class="meter-label">Progress <b>${p.done.length}/${LESSONS.length}</b></div>
        <div class="meter-bar"><div style="width:${(p.done.length / LESSONS.length) * 100}%"></div></div></div>
      </div>
      <div class="grid-2">
        ${LESSONS.map(
          (
            l,
          ) => `<div class="card lesson ${p.done.includes(l.id) ? "done" : ""}">
          <div class="lesson-ico">${l.icon}</div><h3>${l.title}</h3>
          <p class="muted small">${l.body.slice(0, 90)}…</p>
          <button class="btn ${p.done.includes(l.id) ? "" : "primary"}" data-open="${l.id}">${p.done.includes(l.id) ? "✓ Completed — Review" : "Start Lesson"}</button>
        </div>`,
        ).join("")}
      </div>`;
    view
      .querySelectorAll("[data-open]")
      .forEach((b) => (b.onclick = () => openLesson(b.dataset.open)));
  }

  function openLesson(id) {
    const l = LESSONS.find((x) => x.id === id);
    const m = W.ui.modal({
      title: `${l.icon} ${l.title}`,
      body: `<p style="line-height:1.7">${l.body}</p>
        <div class="mt"><b>Quiz:</b> ${l.quiz.q}
        ${l.quiz.a.map((a, i) => `<label class="quiz-opt"><input type="radio" name="quiz" value="${i}"> ${a}</label>`).join("")}</div>
        <div id="quiz-fb" class="mt"></div>`,
      footer: `<button class="btn primary" id="quiz-go">Check Answer</button>`,
    });
    m.el.querySelector("#quiz-go").onclick = () => {
      const sel = m.el.querySelector("input[name=quiz]:checked");
      const fb = m.el.querySelector("#quiz-fb");
      if (!sel) {
        fb.innerHTML = '<p class="muted">Pick an answer first.</p>';
        return;
      }
      if (+sel.value === l.quiz.correct) {
        const p = prog();
        if (!p.done.includes(l.id)) {
          p.done.push(l.id);
          W.store.set(KEY, p);
        }
        fb.innerHTML = '<p class="up"><b>Correct! 🎉 Lesson complete.</b></p>';
        if (W.achievements) W.achievements.check();
        setTimeout(() => {
          m.close();
          render(document.getElementById("view"));
        }, 900);
      } else fb.innerHTML = '<p class="down">Not quite — try again!</p>';
    };
  }

  return { render };
})();
