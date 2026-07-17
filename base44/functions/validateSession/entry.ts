import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

    const isActive = employee.is_active_override !== null && employee.is_active_override !== undefined
      ? employee.is_active_override
      : employee.is_active;
    if (!isActive) {
      return Response.json({ valid: false, reason: 'deactivated' });
    }

    return Response.json({
      valid: true,
      user: {
        name: employee.full_name,
        email: employee.email,
        employeeCode: employee.employee_code,
        department: employee.department,
        role: employee.role_override || employee.role,
        team: employee.team_name,
      },
    });
  } catch (error) {
    return Response.json({ valid: true, reason: 'error', error: error.message });
  }
});