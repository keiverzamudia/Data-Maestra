import * as React from 'react';

interface ImageLightboxProps {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
  downloadFilename?: string;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  src,
  alt = 'Imagen',
  open,
  onClose,
  downloadFilename,
}) => {
  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = downloadFilename || 'imagen';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="modal-overlay"
      style={{ background: 'rgba(0,0,0,.85)', cursor: 'pointer' }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'rgba(255,255,255,.15)',
          border: 'none',
          color: '#fff',
          fontSize: 24,
          width: 40,
          height: 40,
          borderRadius: '50%',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
          zIndex: 51,
        }}
      >
        ✕
      </button>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: '90vw',
          maxHeight: '90vh',
        }}
      >
        <img
          src={src}
          alt={alt}
          style={{
            maxWidth: '90vw',
            maxHeight: '80vh',
            objectFit: 'contain',
            borderRadius: 8,
          }}
        />
        <button
          onClick={handleDownload}
          style={{
            marginTop: 12,
            padding: '8px 20px',
            background: 'rgba(255,255,255,.15)',
            border: '1px solid rgba(255,255,255,.3)',
            color: '#fff',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Descargar imagen
        </button>
      </div>
    </div>
  );
};
