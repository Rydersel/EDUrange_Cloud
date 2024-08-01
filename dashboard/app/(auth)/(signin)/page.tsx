import { Metadata } from 'next';
import UserAuthForm from '@/components/forms/user-auth-form';
import { BackgroundGradientAnimation } from '@/components/splash/background-gradient-animation';

export const metadata: Metadata = {
  title: 'Authentication',
};

export default function AuthenticationPage() {
  return (
    <div className="relative h-screen w-screen">
      <BackgroundGradientAnimation>
      </BackgroundGradientAnimation>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-1/3 h-auto flex items-center justify-center bg-black bg-opacity-50 p-10 rounded">
          <UserAuthForm />
        </div>
      </div>
    </div>
  );
}
