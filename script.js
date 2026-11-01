
const form = document.getElementById("searchForm");
const usernameInput = document.getElementById("username");
const button = document.getElementById("analyzeBtn");
const statusText = document.getElementById("status");
const results = document.getElementById("results");
const playerCard = document.getElementById("playerCard");

document.getElementById("year").textContent =
  new Date().getFullYear();

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function ratingBox(label, value) {
  const box = createElement("div", "rating-box");
  box.appendChild(createElement("span", "rating-label", label));
  box.appendChild(
    createElement("span", "rating-value", value ?? "N/A")
  );
  return box;
}

async function getJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Chess.com player not found.");
    }

    if (response.status === 429) {
      throw new Error("Chess.com rate limit reached. Try again later.");
    }

    throw new Error("Chess.com API request failed.");
  }

  return response.json();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = usernameInput.value.trim();

  if (!/^[a-zA-Z0-9_-]{3,25}$/.test(username)) {
    statusText.textContent = "Enter a valid Chess.com username.";
    return;
  }

  button.disabled = true;
  button.textContent = "Loading...";
  statusText.textContent = "Fetching public Chess.com data...";
  results.classList.add("hidden");
  playerCard.replaceChildren();

  try {
    const encoded = encodeURIComponent(username);

    const [profile, stats] = await Promise.all([
      getJSON(`https://api.chess.com/pub/player/${encoded}`),
      getJSON(`https://api.chess.com/pub/player/${encoded}/stats`)
    ]);

    const header = createElement("div", "player-header");

    if (profile.avatar) {
      const avatar = createElement("img", "player-avatar");
      avatar.src = profile.avatar;
      avatar.alt = "Player avatar";
      avatar.referrerPolicy = "no-referrer";
      header.appendChild(avatar);
    }

    const identity = createElement("div");
    identity.appendChild(
      createElement("h3", "player-name", profile.username || username)
    );

    const link = createElement("a", "player-link", "View Chess.com profile");
    link.href = `https://www.chess.com/member/${encodeURIComponent(
      profile.username || username
    )}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    identity.appendChild(link);
    header.appendChild(identity);

    const ratings = createElement("div", "rating-grid");

    ratings.appendChild(
      ratingBox("BULLET", stats.chess_bullet?.last?.rating)
    );

    ratings.appendChild(
      ratingBox("BLITZ", stats.chess_blitz?.last?.rating)
    );

    ratings.appendChild(
      ratingBox("RAPID", stats.chess_rapid?.last?.rating)
    );

    playerCard.appendChild(header);
    playerCard.appendChild(ratings);

    results.classList.remove("hidden");
    statusText.textContent =
      "Player data loaded. Fair Play Review is coming soon.";

    results.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } catch (error) {
    statusText.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Analyze Player →";
  }
});
