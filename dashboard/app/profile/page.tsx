import { MainNavigation } from '@/components/MainNavigation'
import {getServerSession} from "next-auth/next";
import authConfig from "@/auth.config";
import {redirect} from "next/navigation";

export default async function Profile() {
    const session = await getServerSession(authConfig);
    if (!session) {
        redirect('/'); // Redirect to sign-in page if not authenticated
    }
    return (
        <div>
            <MainNavigation/>
            <main className="container mx-auto p-6">
                <h1 className="text-4xl font-bold mb-6">User Profile</h1>
                {/* Placeholder for profile content */}
                <p className="text-xl">Profile content coming soon...</p>
            </main>
        </div>
    )
}

