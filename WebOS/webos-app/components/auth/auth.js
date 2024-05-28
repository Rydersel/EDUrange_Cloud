
//Not currently being used

import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { saltAndHashPassword } from "@/utils/password"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({

      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        let user = null

        // logic to salt and hash password
        const pwHash = saltAndHashPassword(credentials.password)

        user = await getUserFromDb(credentials.email, pwHash)

        if (!user) {

          throw new Error("User not found.")
        }

        return user
      },
    }),
  ],
})
