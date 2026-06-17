export function ChatMessage({ message, isLast, isThinking }) {
  const isUser = message.role === "user";

  return (
    <div className={`chatBubbleRow ${isUser ? "user" : "bot"}`}>
      {!isUser && (
        <img className="chatBotMini" src="/assets/2.png" alt="챗봇" />
      )}
      <div className={`chatBubble ${isUser ? "user" : "bot"}`}>
        {message.text}
        {!isUser && isLast && isThinking && !message.text && <span>...</span>}
      </div>
    </div>
  );
}
