import { useState } from 'react';

function TagInput({ tags = [], onChange, placeholder = "Add tags...", availableTags = [] }) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    setShowSuggestions(e.target.value.length > 0);
  };

  const addTag = (tag) => {
    const cleanTag = tag.trim().toLowerCase();
    if (cleanTag && !tags.includes(cleanTag)) {
      onChange([...tags, cleanTag]);
    }
    setInputValue('');
    setShowSuggestions(false);
  };

  const removeTag = (tagToRemove) => {
    onChange(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    addTag(suggestion);
  };

  const filteredSuggestions = availableTags.filter(tag => 
    tag.toLowerCase().includes(inputValue.toLowerCase()) && 
    !tags.includes(tag)
  );

  return (
    <div className="tag-input-container">
      <div className="tags-display" style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        marginBottom: '8px'
      }}>
        {tags.map(tag => (
          <span
            key={tag}
            className="tag-item"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: '#e3f2fd',
              color: '#1976d2',
              padding: '4px 8px',
              borderRadius: '12px',
              fontSize: '0.8rem',
              gap: '4px'
            }}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              style={{
                background: 'none',
                border: 'none',
                color: '#1976d2',
                cursor: 'pointer',
                padding: '0',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          onFocus={() => setShowSuggestions(inputValue.length > 0)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={placeholder}
          className="form-input"
          style={{ width: '100%' }}
        />
        
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div
            className="suggestions-dropdown"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              background: 'white',
              border: '1px solid #ddd',
              borderTop: 'none',
              borderRadius: '0 0 4px 4px',
              maxHeight: '150px',
              overflowY: 'auto',
              zIndex: 1000,
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            {filteredSuggestions.slice(0, 8).map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  background: 'white',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  color: '#333'
                }}
                onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                onMouseLeave={(e) => e.target.style.background = 'white'}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
      
      <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
        Press Enter or comma to add tags
      </div>
    </div>
  );
}

export default TagInput;