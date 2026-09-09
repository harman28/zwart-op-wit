import { useState } from 'react';
import Modal from './Modal.js';

/** "?" button next to the leaderboard heading — opens a plain-language
 * explanation of every number on the board for a player who's curious what
 * their own row actually means. */
export default function LeaderboardExplainer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="info-btn"
        onClick={() => setOpen(true)}
        aria-label="What do these numbers mean?"
        title="What do these numbers mean?"
      >
        ?
      </button>
      {open && (
        <Modal title="What do these numbers mean?" onClose={() => setOpen(false)}>
          <div className="explainer">
            <p>
              This club uses the <strong>Keizer system</strong>: instead of everyone starting equal, each player has a{' '}
              <strong>Value</strong> that reflects how strong they're currently ranked — and how much you earn from a game
              depends on your opponent's Value, not just whether you won.
            </p>

            <h3>Points</h3>
            <p>Your total score this season — the number the leaderboard is actually ranked by.</p>

            <h3>Value</h3>
            <p>
              Recalculated fresh after every round, from your <em>current</em> rank: whoever's in 1st is worth the season's
              top value, 2nd is worth one less, and so on down the table. It's not something you earn and keep — it moves
              with your rank, round to round.
            </p>
            <p>This is also what decides how much a game is worth:</p>
            <ul>
              <li>
                <strong>Win</strong> — you earn your opponent's Value.
              </li>
              <li>
                <strong>Draw</strong> — you earn half your opponent's Value.
              </li>
              <li>
                <strong>Loss</strong> — you earn nothing, but you never lose points either.
              </li>
            </ul>
            <p>Beating someone ranked higher than you is worth more than beating someone ranked lower.</p>

            <h3>Played, W/D/L, Win%</h3>
            <p>
              Games actually played, and your record from them. Win% counts a draw as half a win. Byes and absences don't
              count as "played."
            </p>

            <h3>Color</h3>
            <p>
              How your White/Black games balance out. +1 means one more game as White than Black so far, −1 the reverse, 0
              means you're even.
            </p>

            <h3>Odd</h3>
            <p>
              Whether you've already had this season's "odd one out" round — when there's an odd number of players
              signed up, one person can't be paired and gets a smaller credit instead of a real game. Everyone gets this
              at most once a season, so it rotates around rather than hitting the same person twice.
            </p>

            <h3>Missing a round</h3>
            <p>
              If you're signed up but end up absent, you still get a small credit rather than falling behind for a round
              you didn't play — just less than you'd earn from an actual result.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
