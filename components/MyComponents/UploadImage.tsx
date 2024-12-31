import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

type UploadImageProps = {
  onUpload: (file: File) => void;
  initialImage: string | null;
};

const UploadImage: React.FC<UploadImageProps> = ({ onUpload, initialImage }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(initialImage);

  useEffect(() => {
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreview(initialImage);
    }
  }, [file, initialImage]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
  };

  const handleUpload = () => {
    if (file) {
      onUpload(file);
    }
  };

  return (
    <div className="flex flex-col items-center mt-4">
      {preview ? (
        <Image
          src={preview}
          alt="Profile Preview"
          width={128}
          height={128}
          className="object-cover rounded-full mb-2"
        />
      ) : (
        <div className="w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center mb-2">
          <span className="text-gray-500">N/A</span>
        </div>
      )}
      <input type="file" onChange={handleFileChange} className="mb-2" />
      <Button onClick={handleUpload}>Upload</Button>
    </div>
  );
};

export default UploadImage;