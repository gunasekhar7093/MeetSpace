import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '../common/Button';
import './meeting.css';

export function MeetingChat({ messages, onSendMessage }) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSendMessage(draft.trim());
    setDraft('');
  };

  return (
    <div className="ms-sidebar-body">
      <div className="ms-chat-messages" aria-live="polite">
        {messages.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5, textAlign: 'center', marginTop: 24 }}>
            No messages yet. Start the conversation!
          </p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`ms-chat-bubble ${msg.isSelf ? 'ms-chat-bubble--self' : ''}`}
            >
              <div className="ms-chat-bubble__meta">
                <strong>{msg.isSelf ? 'You' : msg.senderName}</strong>
                <span>{msg.timestamp}</span>
              </div>
              <div className="ms-chat-bubble__text">{msg.text}</div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form className="ms-chat-form" onSubmit={handleSubmit}>
        <input
          id="chatMessageInput"
          name="chatMessageInput"
          type="text"
          className="ms-chat-input"
          placeholder="Send a message to everyone..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Chat message input"
        />
        <Button type="submit" size="sm" variant="primary" disabled={!draft.trim()}>
          <Send size={15} />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}

