"use client"
import React, { useState } from 'react';
import { useSession } from 'next-auth/react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ProfileImage from '@/components/MyComponents/ProfileImage';
import UploadImage from '@/components/MyComponents/UploadImage';

const ProfilePage: React.FC = () => {
  const { data: session } = useSession();
  const [profileImage, setProfileImage] = useState<string | null>(session?.user?.image || null);

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/uploadImage', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    setProfileImage(result.filePath);
  };

  return (
    <div className="flex flex-col items-center mt-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Profile</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center">
          <ProfileImage src={profileImage} alt="User Profile" />
          <UploadImage onUpload={handleUpload} initialImage={profileImage} />
          <div className="mt-4 text-center">
            <p className="text-lg font-semibold">{session?.user?.name || 'Usuário'}</p>
            <p className="text-sm text-gray-500">{session?.user?.email}</p>
          </div>
          <Button className="mt-4" onClick={() => alert('Profile updated!')}>
            Save Changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;