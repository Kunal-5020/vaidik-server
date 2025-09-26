import { Injectable } from '@nestjs/common';
import { UserDocument } from '../schemas/user.schema';

export interface ProfileCompletionResult {
  completionPercentage: number;
  completedFields: string[];
  missingFields: string[];
  suggestions: string[];
}

@Injectable()
export class ProfileCompletionService {
  private readonly profileFields = [
    { field: 'name', weight: 20, label: 'Full Name' },
    { field: 'gender', weight: 10, label: 'Gender' },
    { field: 'dateOfBirth', weight: 15, label: 'Date of Birth' },
    { field: 'timeOfBirth', weight: 10, label: 'Time of Birth' },
    { field: 'placeOfBirth', weight: 10, label: 'Place of Birth' },
    { field: 'city', weight: 10, label: 'City' },
    { field: 'state', weight: 5, label: 'State' },
    { field: 'country', weight: 5, label: 'Country' },
    { field: 'profileImage', weight: 15, label: 'Profile Picture' },
  ];

  calculateProfileCompletion(user: UserDocument): ProfileCompletionResult {
    const completedFields: string[] = [];
    const missingFields: string[] = [];
    let totalWeight = 0;
    let completedWeight = 0;

    this.profileFields.forEach(fieldInfo => {
      const { field, weight, label } = fieldInfo;
      totalWeight += weight;

      if (user[field] && user[field] !== '') {
        completedFields.push(label);
        completedWeight += weight;
      } else {
        missingFields.push(label);
      }
    });

    const completionPercentage = Math.round((completedWeight / totalWeight) * 100);
    const suggestions = this.generateSuggestions(missingFields, completionPercentage);

    return {
      completionPercentage,
      completedFields,
      missingFields,
      suggestions,
    };
  }

  private generateSuggestions(missingFields: string[], percentage: number): string[] {
    const suggestions: string[] = [];

    if (percentage < 50) {
      suggestions.push('Complete your basic profile to get personalized astrology readings');
    }

    if (missingFields.includes('Profile Picture')) {
      suggestions.push('Add a profile picture to make your account more personal');
    }

    if (missingFields.includes('Date of Birth') || missingFields.includes('Time of Birth') || missingFields.includes('Place of Birth')) {
      suggestions.push('Birth details are essential for accurate astrological calculations');
    }

    if (missingFields.includes('Full Name')) {
      suggestions.push('Add your name to personalize your astrology experience');
    }

    if (percentage >= 80) {
      suggestions.push('Great! Your profile is almost complete');
    }

    return suggestions;
  }

  getProfileStrength(percentage: number): string {
    if (percentage >= 80) return 'Strong';
    if (percentage >= 60) return 'Good';
    if (percentage >= 40) return 'Fair';
    return 'Weak';
  }
}
