import { useState, useCallback, useEffect } from "react";

export function useModalClose(open: boolean, onClose: () => void, duration = 100) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setVisible(false);
      onClose();
    }, duration);
  }, [onClose, duration]);

  return { visible, closing, handleClose };
}
