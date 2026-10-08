import React from 'react';
import Image from 'next/image';

type ProfileImageProps = {
  src: string | null;
  alt: string;
};

const ProfileImage: React.FC<ProfileImageProps> = ({ src, alt }) => {
  return (
    <div className="w-32 h-32 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={128}
          height={128}
          className="object-cover"
        />
      ) : (
        <span className="text-gray-500">N/A</span>
      )}
    </div>
  );
};

export default ProfileImage;