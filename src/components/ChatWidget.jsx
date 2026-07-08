import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';
import { useApp, api } from '../context/AppContext';

export default function ChatWidget() {
  const { chatMessages, setChatMessages, currentEmployeeId, contacts, setContacts } = useApp();
  
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const chatEndRef = useRef(null);
  
  const messages = chatMessages[currentEmployeeId] || [];

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!message.trim()) return;
    
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    try {
      const res = await api.post('/messages', {
        receiverId: 1, // Assume 1 is admin in this prototype
        text: message,
        time: nowStr,
        isAuto: false
      });

      const newMsg = { id: res.data.id, text: message, sender: 'employee', time: nowStr, isAuto: false };
      
      setChatMessages(prev => ({
        ...prev,
        [1]: [...(prev[1] || []), newMsg] // using 1 as admin's ID for chat map grouping
      }));
      
      setContacts(prev => prev.map(c => 
        c.id === 1 ? { ...c, lastMessage: message, time: nowStr, unread: c.unread + 1 } : c
      ));

      setMessage('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <button 
        className="chat-widget-btn" 
        onClick={() => setIsOpen(!isOpen)}
        style={{ display: isOpen ? 'none' : 'flex' }}
      >
        <MessageSquare size={28} />
      </button>

      {isOpen && (
        <div className="chat-window animate-fade-in">
          <div className="chat-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'white', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>M</div>
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', borderRadius: '50%', background: '#4ade80', border: '2px solid var(--primary)' }}></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>Manager</span>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)} 
              style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '0.5rem' }}
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="chat-body">
            {messages.map(msg => (
              <div key={msg.id} className={`chat-message ${msg.sender === 'employee' ? 'sent' : 'received'}`} style={{ border: msg.isAuto ? '1px solid var(--danger)' : 'none' }}>
                {msg.text}
                <div style={{ fontSize: '0.65rem', color: msg.sender === 'employee' ? 'rgba(255,255,255,0.8)' : '#8696a0', textAlign: 'right', marginTop: '4px' }}>
                  {msg.time} {msg.isAuto && '(Automated Alert)'}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          
          <div className="chat-footer">
            <input 
              type="text" 
              className="form-input" 
              placeholder="Type a message..." 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              style={{ flex: 1 }}
            />
            <button 
              className="btn btn-primary" 
              onClick={handleSend} 
              style={{ padding: '0.5rem 1rem' }}
              disabled={!message.trim()}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
