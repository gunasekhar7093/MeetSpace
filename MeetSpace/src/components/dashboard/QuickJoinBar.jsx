import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Keyboard, ArrowRight } from 'lucide-react';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { parseMeetingInput, validateMeetingInput } from '../../utils/validators';
import { useToast } from '../../hooks/useAppContext';

export function QuickJoinBar() {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationError = validateMeetingInput(value);
    if (validationError) {
      setError(validationError);
      return;
    }

    const meetingId = parseMeetingInput(value);
    showToast(`Joining meeting ${meetingId}...`, 'info');
    navigate(`/room/${meetingId}`);
  };

  return (
    <form className="ms-quick-join-form" onSubmit={handleSubmit} noValidate>
      <div style={{ flex: 1 }}>
        <Input
          name="quickJoinCode"
          placeholder="Enter Meeting ID or link (e.g., des-4821-uxs)"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError('');
          }}
          error={error}
          leftIcon={<Keyboard size={16} />}
          aria-label="Meeting ID or link"
        />
      </div>
      <Button type="submit" variant="outline" size="md" style={{ height: 42 }}>
        <span>Join</span>
        <ArrowRight size={15} />
      </Button>
    </form>
  );
}
