import NextAuth, { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "@/lib/prisma";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";

// Define as tipagens personalizadas
declare module "next-auth" {
    interface Session {
      user: {
        id: string; // ID do usuário
        name: string | null;
        email: string | null;
        image: string | null;
      };
    }
  
    interface JWT {
      id: string; // ID do usuário
      name?: string | null;
      email?: string | null;
      picture?: string | null;
    }
  }

// Configurações do NextAuth
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  debug: true, // Ativa o modo de depuração
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID as string,
      clientSecret: process.env.GITHUB_SECRET as string,
    }),
    GoogleProvider({
      name : "google",
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET, // Obrigatório para JWT
  session: {
    strategy: "jwt", // Usa JWT ao invés do banco de dados para sessões
  },
  callbacks: {

    // async redirect({ url, baseUrl }) {
    //   if (url.startsWith(baseUrl)) {
    //     return `${baseUrl}/?login=success`; // Adiciona ?login=success no redirecionamento
    //   }
    //   return `${baseUrl}/?login=success`;
    // },


    async jwt({ token, user,  }) {
      // Durante o login, o objeto `user` estará disponível
      if (user) {

      console.log("user pego do auth",user)
        token.id = user.id; // Adiciona o ID do usuário ao token
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image;
      }
      return token;
    },
    async session({ session, token }) {
      // Adiciona o ID do token à sessão
        session.user = {
            id: token.id as string,
            name: token.name || null,
            email: token.email || null,
            image: token.picture || null,
          };
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
