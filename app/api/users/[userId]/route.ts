import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

// Types
interface UpdateUserRequest {
  company_code?: string;
  password?: string;
  role?: string;
  store_name?: string;
  group?: string;
}

interface UserProfile {
  id: string;
  company_code: string;
  role: string;
  store_name: string | null;
  group: string | null;
}

interface ErrorResponse {
  error: string;
  details?: string;
}

interface SuccessResponse {
  success: boolean;
  data?: UserProfile;
}

// Helper functions
const createErrorResponse = (
  message: string,
  status: number,
  details?: string
): NextResponse => {
  return NextResponse.json({ error: message, details } as ErrorResponse, {
    status,
  });
};

const createSuccessResponse = (data: SuccessResponse): NextResponse => {
  return NextResponse.json(data);
};

// Ensure environment variables are set
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_URL");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing env.SUPABASE_SERVICE_ROLE_KEY");
}

// Create Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

// Route handlers
export async function DELETE(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;

    // Fetch the user to be deleted
    const { data: userToDelete, error: fetchUserError } = await supabaseAdmin
      .from("Profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (fetchUserError || !userToDelete) {
      return createErrorResponse("ユーザーの取得に失敗しました", 404);
    }

    // Prevent deletion if the user is 'admin'
    if (userToDelete.role === "admin") {
      return createErrorResponse("本部ユーザーは削除できません", 403);
    }

    // Delete the user from Supabase Auth
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(
      userId
    );

    if (authError) {
      return createErrorResponse("ユーザーの削除に失敗しました", 500);
    }

    // Delete the user's profile
    const { error: profileError } = await supabaseAdmin
      .from("Profiles")
      .delete()
      .eq("id", userId);

    if (profileError) {
      return createErrorResponse("プロフィールの削除に失敗しました", 500);
    }

    return createSuccessResponse({ success: true });
  } catch (error) {
    console.error("Server error:", error);
    return createErrorResponse(
      "サーバーエラーが発生しました",
      500,
      error instanceof Error ? error.message : undefined
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const body = (await request.json()) as UpdateUserRequest;

    // Initialize Supabase client with cookies
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Ensure the user is authenticated
    if (!session) {
      return createErrorResponse("認証が必要です", 401);
    }

    // Check if the current user has permission (is admin)
    const { data: currentUser, error: fetchUserError } = await supabaseAdmin
      .from("Profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();

    if (fetchUserError || !currentUser || currentUser.role !== "admin") {
      return createErrorResponse("権限がありません", 403);
    }

    // Update auth user if email or password is provided
    const authUpdateData: { email?: string; password?: string } = {};
    if (body.company_code) {
      authUpdateData.email = `${body.company_code}@example.com`;
    }
    if (body.password) {
      authUpdateData.password = body.password;
    }

    if (Object.keys(authUpdateData).length > 0) {
      const { error: updateAuthError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, authUpdateData);

      if (updateAuthError) {
        return createErrorResponse("認証情報の更新に失敗しました", 500);
      }
    }

    // Prepare update data for Profiles table
    const updateData = {
      company_code: body.company_code,
      role: body.role,
      store_name: body.role === "store" ? body.store_name : null,
      group: body.group,
    };

    // Update user profile
    const { data: updatedProfile, error: updateProfileError } =
      await supabaseAdmin
        .from("Profiles")
        .update(updateData)
        .eq("id", userId)
        .select()
        .single();

    if (updateProfileError) {
      return createErrorResponse(
        "プロフィールの更新に失敗しました",
        500,
        updateProfileError.message
      );
    }

    return createSuccessResponse({
      success: true,
      data: updatedProfile,
    });
  } catch (error) {
    console.error("Server error:", error);
    return createErrorResponse(
      "サーバーエラーが発生しました",
      500,
      error instanceof Error ? error.message : undefined
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
