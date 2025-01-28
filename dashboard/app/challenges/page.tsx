import { MainNavigation } from '@/components/MainNavigation'
import { ChallengeList } from '@/components/ChallengeList'
import {redirect} from "next/navigation";
import {getServerSession} from "next-auth/next";
import authConfig from "@/auth.config";


export default async function Challenges() {
    const session = await getServerSession(authConfig);
    if (!session) {
        redirect('/'); // Redirect to sign-in page if not authenticated
    }
    return (
        <div>
            <MainNavigation/>
            <main className="container mx-auto p-6">
                <h1 className="text-4xl font-bold mb-6">Challenges</h1>
                <ChallengeList/>
            </main>
        </div>
    )
}

