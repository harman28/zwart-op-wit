import { useState } from 'react';
import Modal from './Modal.js';

/** "?" button next to the leaderboard heading — opens a plain-language
 * explanation of every number on the board for a player who's curious what
 * their own row actually means. */
export default function LeaderboardExplainer({ topValue }: { topValue: number }) {
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
            <p>Our club uses the Keizer system for ranking. Here's what everything means.</p>

            <h3>Value</h3>
            <p>
              Your relative strength in the club. When you win a game, you earn your opponent's value. When you draw,
              you earn half. When you lose, nothing happens.
            </p>
            <p>
              Value itself resets every round based on your current rank. The #1 ranked player gets the season's top
              value ({topValue} for our club), #2 gets one less than that, and so on.
            </p>

            <h3>Points</h3>
            <p>Your total score this season.</p>

            <h3>Played, W/D/L, Win%</h3>
            <p>Games played and your record. A draw counts as half a win.</p>

            <h3>Color</h3>
            <p>
              Your White vs Black balance. +1 means you've played one extra White game, −1 means one extra Black.
            </p>

            <h3>Odd</h3>
            <p>Whether you've had your one "odd one out" bye this season yet.</p>

            <p>Were you absent for a round? You get a small credit anyway, for up to a few rounds.</p>
          </div>
        </Modal>
      )}
    </>
  );
}
