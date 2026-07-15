import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Session validation — checks whether the given email is still an active
// employee in the synced cache. Called by the frontend every 5 minutes
// (via useAuth) to detect deactivation without reloading the page.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email } = await req.json();

    if (!email) {
      return Response.json({ valid: false, reason: 'No email provided' });
    }

    const employees = await base44.asServiceRole.entities.SyncedEmployee.filter({
      email: email.toLowerCase(),
    });

    const employee = employees[0];
    if (!employee) {
      return Response.json({ valid: false, reason: 'not_found' });
    }

    if (!employee.is_active) {
      return Response.json({ valid: false, reason: 'deactivated' });
    }

    return Response.json({
      valid: true,
      user: {
        name: employee.full_name,
        email: employee.email,
        employeeCode: employee.employee_code,
        department: employee.department,
        role: employee.role,
        team: employee.team_name,
      },
    });
  } catch (error) {
    // On technical errors, don't log the user out — only explicit
    // deactivation or removal should end a session.
    return Response.json({ valid: true, reason: 'error', error: error.message });
  }
});