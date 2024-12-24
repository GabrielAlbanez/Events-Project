import NextAuth, { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null | undefined;
    };
  }

  interface JWT {
    id: string;
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text", placeholder: "email@example.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          throw new Error("Email e senha são obrigatórios");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          throw new Error("Usuário não encontrado");
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password || ""
        );

        if (!isPasswordValid) {
          throw new Error("Senha incorreta");
        }

        return user
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account, profile }) {

      if(account?.provider === "credentials") return true

      if (!user?.email || !account) {
        throw new Error("Dados de usuário ou conta estão ausentes.");
      }
  
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
        include: { accounts: true },
      });
  
      if (existingUser) {
        const isSameProvider = existingUser.accounts.some(
          (acc) => acc.provider === account.provider
        );
  
        if (!isSameProvider) {
          throw new Error(
            encodeURIComponent( `Esse e-mail ja está vinculado ao um outro proverdor de autenticação.`)
           
          );
        }
      } else {
        await prisma.user.create({
          data: {
            email: user.email,
            name: user.name,
            image: user.image,
            accounts: {
              create: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                type: account.type,
              },
            },
          },
        });
      }
  
      return true;
    },
  
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.image = user.image;
      }
      console.log("user",user)
      return token;
    },
  
    async session({ session, token }) {
      session.user = {
        id: token.id as string,
        name: token.name || null,
        email: token.email || null,
        image: typeof token.image === "string" ? token.image : null,
      };
      return session;
    },
  },
  pages: {
    signIn: "/login", // Página de login personalizada
    error: "/login", // Redireciona para login em caso de erro
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
